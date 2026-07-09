import React from 'react';
import { BookOpen, Hash, ArrowUpDown, AlignLeft, Scale, BarChart2 } from 'lucide-react';
import { motion } from 'framer-motion';

const metrics = [
  { id: 'WC', name: 'Word Count', icon: Hash, desc: 'Verbosity and Descriptiveness of the generated text.' },
  { id: 'TTR', name: 'Type-Token Ratio', icon: BookOpen, desc: 'Lexical diversity. Higher score generally means less repetitive vocabulary.' },
  { id: 'ASL', name: 'Avg. Sentence Length', icon: ArrowUpDown, desc: 'Syntactic complexity. Longer sentences imply more complex structures.' },
  { id: 'H', name: 'Entropy', icon: BarChart2, desc: 'Information density and unpredictability of the tokens generated.' },
  { id: 'FRE', name: 'Readability', icon: AlignLeft, desc: 'Flesch Reading Ease. Lower score = More Academic & Complex.' },
];

const modelData = [
  { name: 'Gemini 2.5 Flash', wc: 1457, ttr: 0.1833, asl: 14.43, entropy: 7.411, readability: 14.28 },
  { name: 'GPT-4o-Mini', wc: 796, ttr: 0.1847, asl: 9.36, entropy: 6.312, readability: 26.54 },
  { name: 'Llama 3.3 70B', wc: 718, ttr: 0.2075, asl: 11.05, entropy: 6.325, readability: 34.32 },
  { name: 'Command-R', wc: 625, ttr: 0.2176, asl: 8.56, entropy: 6.228, readability: 35.17 },
];

const inferences = [
  { 
    name: 'Gemini 2.5 Flash', 
    summary: 'Dense & Academic', 
    desc: 'Most talkative model by a wide margin; creates complex, information-heavy text with low readability scores (highly academic).',
    color: 'from-blue-50 to-blue-100',
    borderColor: 'border-blue-200'
  },
  { 
    name: 'GPT-4o-Mini', 
    summary: 'Moderate & Efficient', 
    desc: 'Balanced overall output but structural choices lean towards a slightly repetitive choice of terms (lower TTR for its size).',
    color: 'from-green-50 to-green-100',
    borderColor: 'border-green-200'
  },
  { 
    name: 'Llama 3.3 70B', 
    summary: 'Clear & Descriptive', 
    desc: 'The best balance between lexical diversity and clarity. Delivers strong unpredictability without excessive length.',
    color: 'from-cyan-50 to-cyan-100',
    borderColor: 'border-cyan-200'
  },
  { 
    name: 'Command-R', 
    summary: 'Concise & Varied', 
    desc: 'Highly concise. Best for direct, non-repetitive quick quizzes. Achieves the highest lexical diversity (TTR) despite lowest word count.',
    color: 'from-purple-50 to-purple-100',
    borderColor: 'border-purple-200'
  },
];

export default function Analytics() {
  return (
    <div className="w-full min-h-screen py-16 px-6 relative z-10">
      <div className="max-w-6xl mx-auto space-y-16">
        
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-4">Model Performance & Metrics Lab</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Deep dive into the inference characteristics of the leading LLMs utilized in the Aegis platform.
          </p>
        </div>

        {/* Section A: Metric Glossary */}
        <section>
          <div className="flex items-center mb-6">
            <Scale className="w-6 h-6 text-indigo-600 mr-3" />
            <h2 className="text-2xl font-bold text-slate-900">Metric Glossary</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {metrics.map((m) => (
              <div key={m.id} className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:shadow-md hover:border-indigo-200 transition-all">
                <m.icon className="w-6 h-6 text-indigo-600 mb-3" />
                <h3 className="font-semibold text-slate-900 mb-1 flex items-center justify-between">
                  {m.name}
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono border border-slate-200">{m.id}</span>
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section B: Data Visualization */}
        <section>
          <div className="flex items-center mb-6">
            <BarChart2 className="w-6 h-6 text-indigo-600 mr-3" />
            <h2 className="text-2xl font-bold text-slate-900">Measured Metrics Array</h2>
          </div>
          <div className="w-full overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 text-sm tracking-wide font-semibold text-slate-700">Target Model</th>
                  <th className="p-4 text-sm tracking-wide font-semibold text-slate-700 text-right">Word Count (WC)</th>
                  <th className="p-4 text-sm tracking-wide font-semibold text-slate-700 text-right">Type-Token Ratio (TTR)</th>
                  <th className="p-4 text-sm tracking-wide font-semibold text-slate-700 text-right">Sentence Len (ASL)</th>
                  <th className="p-4 text-sm tracking-wide font-semibold text-slate-700 text-right">Entropy (H)</th>
                  <th className="p-4 text-sm tracking-wide font-semibold text-slate-700 text-right">Readability (FRE)</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {modelData.map((row) => (
                  <tr key={row.name} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-semibold text-slate-900 flex items-center">
                      <div className="w-2 h-2 rounded-full bg-indigo-500 mr-3 hidden sm:block"></div>
                      {row.name}
                    </td>
                    <td className="p-4 font-mono text-slate-600 text-right">{row.wc}</td>
                    <td className="p-4 font-mono text-slate-600 text-right">{row.ttr.toFixed(4)}</td>
                    <td className="p-4 font-mono text-slate-600 text-right">{row.asl.toFixed(2)}</td>
                    <td className="p-4 font-mono text-slate-600 text-right">{row.entropy.toFixed(3)}</td>
                    <td className="p-4 font-mono text-slate-600 text-right">{row.readability.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section C: Style & Inference Summary */}
        <section>
          <div className="flex items-center mb-6">
            <BookOpen className="w-6 h-6 text-indigo-600 mr-3" />
            <h2 className="text-2xl font-bold text-slate-900">Key Inferences</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {inferences.map((inf, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                key={inf.name} 
                className={`bg-gradient-to-br ${inf.color} border ${inf.borderColor} backdrop-blur-md p-6 rounded-2xl flex flex-col shadow-sm`}
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-bold text-slate-900">{inf.name}</h3>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 shadow-sm">
                    {inf.summary}
                  </span>
                </div>
                <p className="text-slate-700 text-sm leading-relaxed mt-auto">{inf.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
