import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, FileDown, FileSpreadsheet, BrainCircuit, CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { api, getApiErrorMessage } from "../../api/client";
import toast from "react-hot-toast";

export default function QuizResults() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [results, setResults] = useState([]);
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null);

  // --- Feedback state ---
  const [showFeedbackPanel, setShowFeedbackPanel] = useState(false);
  const [filterMode, setFilterMode] = useState("all"); // "all" | "threshold" | "manual"
  const [threshold, setThreshold] = useState(70);
  const [manualSelected, setManualSelected] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [feedbackCards, setFeedbackCards] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const pollRef = useRef(null);
  const pollStartRef = useRef(null);
  const [timeoutMsg, setTimeoutMsg] = useState(false);

  useEffect(() => { fetchData(); }, [id]);
  useEffect(() => () => clearInterval(pollRef.current), []);

  const fetchData = async () => {
    try {
      const [quizData, resultsData] = await Promise.all([api.getQuiz(id), api.getQuizResults(id)]);
      setQuiz(quizData);
      setResults(resultsData);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to fetch results"));
    } finally {
      setLoading(false);
    }
  };

  const triggerDownload = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleSimpleReport = async () => {
    setDownloading("simple");
    const tid = toast.loading("Generating Simple Report...");
    try {
      const r = await api.downloadSimpleReport(id);
      triggerDownload(r.data, `${quiz.title}_simple_report.xlsx`);
      toast.success("Downloaded!", { id: tid });
    } catch (err) { toast.error(getApiErrorMessage(err, "Failed"), { id: tid }); }
    finally { setDownloading(null); }
  };

  const handleDetailedReport = async () => {
    setDownloading("detailed");
    const tid = toast.loading("Generating Detailed Report...");
    try {
      const r = await api.downloadDetailedReport(id);
      triggerDownload(r.data, `${quiz.title}_detailed_report.xlsx`);
      toast.success("Downloaded!", { id: tid });
    } catch (err) { toast.error(getApiErrorMessage(err, "Failed"), { id: tid }); }
    finally { setDownloading(null); }
  };

  // --- Feedback helpers ---
  const totalMarks = quiz?.questions?.reduce((s, q) => s + q.marks, 0) || quiz?.questions?.length || 1;

  const resolvedStudents = () => {
    const attempted = results.filter(r => r.attempted);
    if (filterMode === "all") return attempted;
    if (filterMode === "threshold") return attempted.filter(r => ((r.score || 0) / totalMarks * 100) < threshold);
    if (filterMode === "manual") return attempted.filter(r => manualSelected.includes(r.student_id || r.id));
    return [];
  };

  const studentCount = resolvedStudents().length;
  const estimatedMin = Math.ceil(Math.min(studentCount * 8, 180) / 60);
  const timeoutSecs = Math.min(studentCount * 8, 180);

  const handleGenerateConfirm = async () => {
    setShowConfirmModal(false);
    setGenerating(true);
    setFeedbackCards([]);
    setTimeoutMsg(false);

    const students = resolvedStudents();
    const payload = filterMode === "manual"
      ? { student_ids: students.map(s => s.student_id || s.id) }
      : filterMode === "threshold"
      ? { score_threshold: threshold }
      : {};

    const tid = toast.loading("Queuing feedback tasks...");
    try {
      const res = await api.generateFeedback(id, payload);
      toast.success(`${res.queued} tasks queued, ${res.skipped} skipped.`, { id: tid });
      startPolling();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to queue feedback"), { id: tid });
      setGenerating(false);
    }
  };

  const startPolling = () => {
    pollStartRef.current = Date.now();
    pollRef.current = setInterval(async () => {
      const elapsed = (Date.now() - pollStartRef.current) / 1000;
      if (elapsed > timeoutSecs) {
        clearInterval(pollRef.current);
        setTimeoutMsg(true);
        setGenerating(false);
        return;
      }
      try {
        const cards = await api.getFeedbackStatus(id);
        setFeedbackCards(cards);
        const allDone = cards.every(c => c.status !== "pending");
        if (allDone) { clearInterval(pollRef.current); setGenerating(false); }
      } catch (e) { /* ignore poll errors */ }
    }, 3000);
  };

  const handleApprove = async (card, text) => {
    try {
      await api.reviewFeedback(id, [{ student_id: card.student_id, action: "approve", edited_text: text || null }]);
      setFeedbackCards(prev => prev.map(c => c.student_id === card.student_id ? { ...c, status: "approved", final_text: text || c.ai_text } : c));
      toast.success(`Approved for ${card.student_name}`);
    } catch (err) { toast.error(getApiErrorMessage(err, "Failed")); }
  };

  const handleSkip = async (card) => {
    try {
      await api.reviewFeedback(id, [{ student_id: card.student_id, action: "skip" }]);
      setFeedbackCards(prev => prev.map(c => c.student_id === card.student_id ? { ...c, status: "skipped" } : c));
    } catch (err) { toast.error(getApiErrorMessage(err, "Failed")); }
  };

  const handleDelete = async (card) => {
    try {
      await api.reviewFeedback(id, [{ student_id: card.student_id, action: "delete" }]);
      setFeedbackCards(prev => prev.filter(c => c.student_id !== card.student_id));
      toast.success("Removed");
    } catch (err) { toast.error(getApiErrorMessage(err, "Failed")); }
  };

  const handleRetry = async (card) => {
    try {
      await api.retryFeedback(id, card.student_id);
      setFeedbackCards(prev => prev.map(c => c.student_id === card.student_id ? { ...c, status: "pending", error_msg: null } : c));
      if (!pollRef.current) startPolling();
      toast.success("Retrying...");
    } catch (err) { toast.error(getApiErrorMessage(err, "Failed")); }
  };

  const handleApproveAllReady = async () => {
    const ready = feedbackCards.filter(c => c.status === "ready");
    if (!ready.length) return;
    try {
      await api.reviewFeedback(id, ready.map(c => ({ student_id: c.student_id, action: "approve" })));
      setFeedbackCards(prev => prev.map(c => c.status === "ready" ? { ...c, status: "approved", final_text: c.ai_text } : c));
      toast.success(`${ready.length} feedbacks approved!`);
    } catch (err) { toast.error(getApiErrorMessage(err, "Failed")); }
  };

  const toggleManual = (sid) => setManualSelected(prev => prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid]);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading results...</div>;
  if (!quiz) return null;

  const attempted = results.filter(r => r.attempted).length;
  const readyCount = feedbackCards.filter(c => c.status === "ready").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4 border-slate-200">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{quiz.title} — Results</h1>
            <p className="text-sm text-slate-500 mt-1">{attempted} of {results.length} students attempted</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={handleSimpleReport} disabled={!!downloading} className="flex items-center space-x-2 px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors disabled:opacity-50">
            <FileDown className="w-4 h-4" /><span>{downloading === "simple" ? "Downloading..." : "Simple Report"}</span>
          </button>
          <button onClick={handleDetailedReport} disabled={!!downloading} className="flex items-center space-x-2 px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors disabled:opacity-50">
            <FileSpreadsheet className="w-4 h-4" /><span>{downloading === "detailed" ? "Downloading..." : "Detailed Report"}</span>
          </button>
          <button onClick={() => setShowFeedbackPanel(v => !v)} className="flex items-center space-x-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors">
            <BrainCircuit className="w-4 h-4" /><span>AI Feedback</span>
            {showFeedbackPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Feedback Panel */}
      {showFeedbackPanel && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-5 space-y-5">
          <h2 className="text-base font-semibold text-violet-900">Generate AI Feedback</h2>

          {/* Filter */}
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              {[["all", "All students who attempted"], ["threshold", "Below score threshold"], ["manual", "Select manually"]].map(([val, label]) => (
                <label key={val} className="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="filterMode" value={val} checked={filterMode === val} onChange={() => setFilterMode(val)} className="text-violet-600" />
                  <span className="text-sm text-slate-700">{label}</span>
                </label>
              ))}
            </div>
            {filterMode === "threshold" && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-slate-600">Below</span>
                <input type="number" min="0" max="100" value={threshold} onChange={e => setThreshold(Number(e.target.value))} className="w-20 rounded border-slate-300 text-sm" />
                <span className="text-sm text-slate-600">%</span>
              </div>
            )}
            {filterMode === "manual" && (
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {results.filter(r => r.attempted).map((r, i) => (
                  <label key={i} className="flex items-center space-x-1 text-xs bg-white border border-slate-200 rounded px-2 py-1 cursor-pointer">
                    <input type="checkbox" checked={manualSelected.includes(r.student_id || r.id)} onChange={() => toggleManual(r.student_id || r.id)} />
                    <span>{r.name || r.email}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-sm text-violet-700 font-medium">
              Will generate for <strong>{studentCount}</strong> student{studentCount !== 1 ? "s" : ""}
              {studentCount > 0 && ` (~${estimatedMin} min)`}
              {studentCount > 100 && <span className="ml-2 text-amber-600">⚠ Large batch — results will appear as they complete</span>}
            </p>
          </div>

          <button onClick={() => studentCount > 0 && setShowConfirmModal(true)} disabled={studentCount === 0 || generating} className="px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors">
            {generating ? "Generating..." : `Generate for ${studentCount} students`}
          </button>

          {/* Review Panel */}
          {feedbackCards.length > 0 && (
            <div className="space-y-3 border-t border-violet-200 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-violet-900">Review Panel</h3>
                {readyCount > 0 && (
                  <button onClick={handleApproveAllReady} className="text-xs px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    Approve All Ready ({readyCount})
                  </button>
                )}
              </div>
              {timeoutMsg && <p className="text-xs text-amber-600">⚠ Some tasks are still processing in the background. Check back in a few minutes.</p>}
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {feedbackCards.map(card => (
                  <div key={card.id} className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{card.student_name}</p>
                        <p className="text-xs text-slate-400">{card.student_email}</p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          card.status === "ready" ? "bg-blue-100 text-blue-700" :
                          card.status === "approved" ? "bg-green-100 text-green-700" :
                          card.status === "skipped" ? "bg-slate-100 text-slate-500" :
                          card.status === "failed" ? "bg-red-100 text-red-700" :
                          "bg-amber-100 text-amber-600"
                        }`}>
                          {card.status === "pending" ? "⏳ Generating..." :
                           card.status === "ready" ? "✅ Ready" :
                           card.status === "approved" ? "✓ Approved" :
                           card.status === "skipped" ? "⊘ Skipped" :
                           "❌ Failed"}
                        </span>
                        {card.status !== "approved" && (
                          <button onClick={() => handleDelete(card)} className="text-xs text-red-500 hover:text-red-700" title="Remove">
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {(card.status === "ready" || card.status === "approved") && (
                      <>
                        {editingId === card.id ? (
                          <textarea
                            className="w-full text-sm border border-violet-300 rounded p-2 min-h-[80px] focus:ring-violet-500"
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                          />
                        ) : (
                          <p className="text-sm text-slate-600 bg-slate-50 rounded p-3 leading-relaxed">
                            {card.final_text || card.ai_text}
                          </p>
                        )}
                        {card.status !== "approved" && (
                          <div className="flex space-x-2">
                            <button onClick={() => handleApprove(card, editingId === card.id ? editText : null)} className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">✅ Approve</button>
                            {editingId === card.id ? (
                              <button onClick={() => { handleApprove(card, editText); setEditingId(null); }} className="text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700">✏️ Save & Approve</button>
                            ) : (
                              <button onClick={() => { setEditingId(card.id); setEditText(card.ai_text || ""); }} className="text-xs px-3 py-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300">✏️ Edit</button>
                            )}
                            <button onClick={() => handleSkip(card)} className="text-xs px-3 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200">⏭ Skip</button>
                          </div>
                        )}
                      </>
                    )}
                    {card.status === "failed" && (
                      <div className="space-y-1">
                        <p className="text-xs text-red-500">{card.error_msg}</p>
                        <button onClick={() => handleRetry(card)} className="flex items-center space-x-1 text-xs px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100">
                          <RefreshCw className="w-3 h-3" /><span>Retry</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Confirm Feedback Generation</h3>
            <p className="text-sm text-slate-600">
              You are about to make <strong>{studentCount} LLM API calls</strong> to generate feedback.
              Estimated time: <strong>~{estimatedMin} minute{estimatedMin !== 1 ? "s" : ""}</strong>.
            </p>
            {studentCount > 100 && <p className="text-xs text-amber-600 bg-amber-50 rounded p-2">⚠ Large batch. Results will appear progressively — you can leave this page and check back later.</p>}
            <div className="flex space-x-3">
              <button onClick={() => setShowConfirmModal(false)} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={handleGenerateConfirm} className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700">Proceed</button>
            </div>
          </div>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Student Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Score</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Submitted At</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {results.length === 0 ? (
              <tr><td colSpan="5" className="px-6 py-8 text-center text-slate-500">No students have attempted this quiz yet.</td></tr>
            ) : (
              results.map((attempt, idx) => (
                <tr key={idx} className={filterMode === "manual" && manualSelected.includes(attempt.student_id || attempt.id) ? "bg-violet-50" : ""}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{attempt.name || "N/A"}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{attempt.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-indigo-600">
                    {attempt.attempted ? `${attempt.score} / ${totalMarks}` : "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${attempt.attempted ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                      {attempt.attempted ? "Attempted" : "Not Attempted"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {attempt.completed_at ? new Date(attempt.completed_at).toLocaleString() : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
