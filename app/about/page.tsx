export default function AboutPage() {
  return (
    <div className="min-h-screen px-6 pt-32 pb-24">

      {/* HERO SECTION */}
      <div className="text-center max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight drop-shadow-lg">
          Reimagining Intelligent Collaboration
        </h1>

        <p className="mt-6 text-lg md:text-xl text-white leading-relaxed max-w-3xl mx-auto">
          SPHINX is a modern collaboration platform designed to simplify
          real-time communication, virtual meetings, and organized teamwork
          through a seamless and scalable experience.
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
            Experience smooth and low-latency video communication powered
            by modern WebRTC architecture for efficient collaboration.
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
            Organized Collaboration
          </h3>

          <p className="mt-4 text-white leading-relaxed">
            Manage meetings, user interactions, and collaboration workflows
            inside a clean and intuitive workspace experience.
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
            Scalable Architecture
          </h3>

          <p className="mt-4 text-white leading-relaxed">
            Built with scalability and performance in mind using modern
            full-stack technologies and efficient system design principles.
          </p>
        </div>

      </div>

      {/* FOOTER NOTE */}
      <div className="mt-24 text-center">
        <p className="text-white/80 text-sm">
          Developed as a B.Tech capstone project focused on modern web
          engineering, communication systems, and scalable application design.
        </p>
      </div>

    </div>
  );
}