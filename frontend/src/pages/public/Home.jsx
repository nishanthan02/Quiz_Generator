import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BrainCircuit, Network, FileJson, SlidersHorizontal, Activity } from 'lucide-react';

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const staggerChildren = {
  visible: { transition: { staggerChildren: 0.1 } }
};

export default function Home() {
  return (
    <div className="w-full min-h-screen pb-24">
      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 max-w-6xl mx-auto flex flex-col items-center text-center relative z-10">
        <motion.div 
          initial="hidden" animate="visible" variants={staggerChildren}
          className="max-w-4xl"
        >
          <motion.div variants={fadeIn} className="inline-flex items-center space-x-2 bg-indigo-50 border border-indigo-200 rounded-full px-4 py-1.5 mb-8 text-indigo-700 text-sm font-medium shadow-sm">
            <Activity className="w-4 h-4" />
            <span>Powered by Real-time Polling Infrastructure</span>
          </motion.div>
          
          <motion.h1 variants={fadeIn} className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 mb-6 leading-tight">
            Transform Academic Content into <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-500">High-Fidelity Assessments</span>
          </motion.h1>
          
          <motion.p variants={fadeIn} className="text-lg md:text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            Leveraging Graph-RAG and Multi-Model Intelligence for hallucination-free quiz generation. Synthesize complex PDFs, PPTs, and DOCX files securely.
          </motion.p>
          
          <motion.div variants={fadeIn} className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
            <Link to="/login" className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-[0_8px_25px_rgba(79,70,229,0.4)] flex items-center group w-full sm:w-auto justify-center">
              Get Started 
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/analytics" className="px-8 py-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-lg transition-all shadow-sm w-full sm:w-auto justify-center flex items-center">
              View Analytics
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section className="px-6 max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">The Power of RAG</h2>
          <p className="text-slate-600 text-lg">Built for accuracy, adaptability, and scale.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="bg-white/80 backdrop-blur-md border border-slate-200 p-8 rounded-2xl hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5 transition-all group"
          >
            <div className="bg-indigo-100 w-14 h-14 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform group-hover:bg-indigo-600 group-hover:text-white text-indigo-600">
              <Network className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Context-Aware RAG</h3>
            <p className="text-slate-600 leading-relaxed">No more generic questions. Quizzes are strictly grounded in your provided course material, supporting PDF, PPT, and DOCX processing.</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
            className="bg-white/80 backdrop-blur-md border border-slate-200 p-8 rounded-2xl hover:border-cyan-200 hover:shadow-xl hover:shadow-cyan-500/5 transition-all group"
          >
            <div className="bg-cyan-100 w-14 h-14 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform group-hover:bg-cyan-500 group-hover:text-white text-cyan-600">
              <BrainCircuit className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Multi-Model Intelligence</h3>
            <p className="text-slate-600 leading-relaxed">Cross-validate and generate optimal assessments by leveraging Gemini 2.5, GPT-4o-Mini, Llama 3.3, and Command-R.</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }}
            className="bg-white/80 backdrop-blur-md border border-slate-200 p-8 rounded-2xl hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-500/5 transition-all group"
          >
            <div className="bg-emerald-100 w-14 h-14 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform group-hover:bg-emerald-500 group-hover:text-white text-emerald-600">
              <FileJson className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">JSON Portability</h3>
            <p className="text-slate-600 leading-relaxed">Obtain structured, schema-compliant JSON downloads instantly for seamless integration into LMS environments like Canvas or Moodle.</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.4 }}
            className="bg-white/80 backdrop-blur-md border border-slate-200 p-8 rounded-2xl hover:border-purple-200 hover:shadow-xl hover:shadow-purple-500/5 transition-all group"
          >
            <div className="bg-purple-100 w-14 h-14 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform group-hover:bg-purple-500 group-hover:text-white text-purple-600">
              <SlidersHorizontal className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Full Logic Control</h3>
            <p className="text-slate-600 leading-relaxed">Maintain human-in-the-loop oversight. Refine difficulty, rewrite stems, and regenerate specific variants before finalizing.</p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
