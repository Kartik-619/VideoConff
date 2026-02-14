export default function AboutPage() {
  return (
    <div className="min-h-screen px-10 py-16 bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-100">
      <h1 className="text-4xl font-extrabold text-slate-800 mb-6">
        About SPHINX
      </h1>

      <p className="max-w-3xl text-slate-700 text-lg leading-relaxed">
        SPHINX is an intelligent video conferencing platform designed to
        simplify meetings with real-time communication, transcripts, and
        structured documentation.  
        <br /><br />
        Our goal is to bridge the gap between live collaboration and
        persistent knowledge by automatically converting meetings into
        meaningful records.
      </p>

      <p className="mt-6 text-slate-600">
        Built as a B.Tech capstone project with a focus on system design,
        scalability, and future research potential.
      </p>
    </div>
  );
}
