import axios from "axios";

function getBaseURL(): string {
  if (typeof window !== "undefined") {
    return "/api/v1";
  }
  return "http://backend:8000/api/v1";
}

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // send httpOnly cookies with every request
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login") &&
      !window.location.pathname.startsWith("/register")
    ) {
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
