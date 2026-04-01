export default function AboutPage() {
  return (
    <div className="min-h-screen px-6 pt-32 pb-24">

      {/* HERO SECTION */}
      <div className="text-center max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight drop-shadow-lg">
          Reimagining Intelligent Collaboration
        </h1>

        <p className="mt-6 text-lg md:text-xl text-white leading-relaxed max-w-3xl mx-auto">
          SPHINX transforms real-time meetings into structured, searchable
          knowledge — combining communication, AI transcripts, and documentation
          into one seamless experience.
        </p>
      </div>


      {/* FEATURE GRID */}
      <div className="mt-20 max-w-6xl mx-auto grid md:grid-cols-3 gap-8">

        {/* Card 1 */}
        <div className="
          bg-slate-900/30 
          backdrop-blur-2xl 
          border border-white/20 
          rounded-2xl 
          p-8 
          shadow-xl
          hover:-translate-y-2 
          hover:bg-slate-900/40 
          transition-all duration-300
        ">
          <h3 className="text-xl font-semibold text-white">
            Real-Time Meetings
          </h3>
          <p className="mt-4 text-white leading-relaxed">
            Low-latency communication powered by modern WebRTC architecture,
            enabling smooth and scalable video collaboration.
          </p>
        </div>

        {/* Card 2 */}
        <div className="
          bg-slate-900/30 
          backdrop-blur-2xl 
          border border-white/20 
          rounded-2xl 
          p-8 
          shadow-xl
          hover:-translate-y-2 
          hover:bg-slate-900/40 
          transition-all duration-300
        ">
          <h3 className="text-xl font-semibold text-white">
            AI-Powered Transcripts
          </h3>
          <p className="mt-4 text-white leading-relaxed">
            Automatically convert conversations into structured transcripts,
            summaries, and searchable knowledge assets.
          </p>
        </div>

        {/* Card 3 */}
        <div className="
          bg-slate-900/30 
          backdrop-blur-2xl 
          border border-white/20 
          rounded-2xl 
          p-8 
          shadow-xl
          hover:-translate-y-2 
          hover:bg-slate-900/40 
          transition-all duration-300
        ">
          <h3 className="text-xl font-semibold text-white">
            Persistent Knowledge
          </h3>
          <p className="mt-4 text-white leading-relaxed">
            Bridge live collaboration with long-term documentation by turning
            meetings into meaningful, organized, and searchable records.
          </p>
        </div>

      </div>


      {/* FOOTER NOTE */}
      <div className="mt-24 text-center">
        <p className="text-white/80 text-sm">
          Built as a B.Tech capstone project with focus on system design,
          scalability, and future AI research potential.
        </p>
      </div>

    </div>
  );
}