import axios from "axios";

const api = axios.create({
  baseURL: "/", // same origin
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // IMPORTANT for NextAuth cookies
});

export default api;