# VideoConff Hosting Guide - What, Where, Why

## 📋 Overview
Your VideoConff app needs 3 services deployed separately:
- **Frontend**: Next.js web app
- **Backend**: WebSocket signaling server for video
- **Database**: Redis for session management

---

## 🎯 Frontend - Vercel
**What**: Next.js web application
**Where**: [vercel.com](https://vercel.com)
**Why**: 
- Free tier with global CDN
- Automatic deployments from GitHub
- Built for Next.js apps
- Custom domains & SSL included

**Steps**:
1. Push code to GitHub
2. Sign up at Vercel
3. Import repository
4. Deploy automatically

**Cost**: Free (100GB bandwidth/month)

---

## 🔌 Backend - Render
**What**: WebSocket signaling server (MediaSoup)
**Where**: [render.com](https://render.com)
**Why**:
- Free tier: 750 hours/month
- WebSocket support (essential for video)
- Built-in PostgreSQL database
- Better for real-time connections than Vercel

**Steps**:
1. Sign up at Render
2. Create "Web Service"
3. Connect GitHub repo
4. Set start command: `node signaling/server.js`
5. Port: 8080

**Cost**: Free (750 hours/month)

---

## 🗄️ Redis - Upstash
**What**: Session storage for video meetings
**Where**: [upstash.com](https://upstash.com)
**Why**:
- Free Redis tier for serverless
- 10,000 commands/day
- Perfect for video app sessions
- Works with Vercel/Render

**Steps**:
1. Sign up at Upstash
2. Create Redis database
3. Copy connection URL
4. Add to environment variables

**Cost**: Free (10K commands/day, 256MB)

---

## 🔧 Environment Variables

### Vercel (Frontend):
```
NEXTAUTH_SECRET=your-random-secret
REDIS_URL=redis://your-upstash-url
WEBSOCKET_URL=wss://your-render-app-url
```

### Render (Backend):
```
REDIS_URL=redis://your-upstash-url
DATABASE_URL=postgresql://your-render-db
NEXTAUTH_SECRET=your-random-secret
```

---

## 🚀 Why This Setup Works

**Vercel**: Best for static/SSR Next.js apps
**Render**: Handles persistent WebSocket connections
**Upstash**: Redis designed for serverless architecture
**Total Cost**: $0-5/month

**Alternative**: Railway.app (all-in-one but less free tier)

---

## 📱 Final URLs
- Frontend: `your-app.vercel.app`
- Backend: `your-app.onrender.com`
- Redis: Internal (no public URL)

## 🧪 Testing
1. Deploy all services
2. Test video calling between 2 users
3. Verify WebSocket connections
4. Check Redis session storage
