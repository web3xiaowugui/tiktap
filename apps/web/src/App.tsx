import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import Discover from "./pages/Discover";
import Landing from "./pages/Landing";
import Profile from "./pages/Profile";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<AppLayout />}>
        <Route path="/discover" element={<Discover />} />
        <Route path="/u/:handle" element={<Profile />} />
        <Route path="/profile" element={<Navigate to="/u/end837" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
