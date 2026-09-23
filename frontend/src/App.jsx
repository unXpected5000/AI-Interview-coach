import { Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "./auth/ProtectedRoute.jsx";
import PublicOnlyRoute from "./auth/PublicOnlyRoute.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import InterviewStartPage from "./pages/InterviewStartPage.jsx";
import InterviewPage from "./pages/InterviewPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import PublicLayout from "./layouts/PublicLayout.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import ResultsPage from "./pages/ResultsPage.jsx";
import ResumeOptimizerPage from "./pages/ResumeOptimizerPage.jsx";
import ResumeUploadPage from "./pages/ResumeUploadPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route element={<PublicOnlyRoute />}>
        <Route element={<PublicLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/resumes/upload" element={<ResumeUploadPage />} />
          <Route path="/interviews/start" element={<InterviewStartPage />} />
          <Route path="/resume-optimizer" element={<ResumeOptimizerPage />} />
          <Route path="/interviews/:interviewId" element={<InterviewPage />} />
          <Route path="/interviews/:interviewId/results" element={<ResultsPage />} />
          <Route path="/results/:interviewId" element={<ResultsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
