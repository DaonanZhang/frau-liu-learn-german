import { createBrowserRouter, RouterProvider } from "react-router-dom";
import AppLayout from "./layouts/AppLayout.jsx";
import Home from "./pages/Home.jsx";
import VideoDetail from "./pages/VideoDetail.jsx";

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/videos/:videoId", element: <VideoDetail /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
