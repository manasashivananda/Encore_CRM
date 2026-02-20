import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import QuoteQualityCheckingDashboard from "./dashboard";
import QuoteQualityCheckingDetail from "./detail";

export default function QuoteQualityCheckingCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<QuoteQualityCheckingLayout />}>
          <Route index element={<QuoteQualityCheckingDashboard />} />
          <Route path=":id" element={<QuoteQualityCheckingDetail />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function QuoteQualityCheckingLayout() {
  return <Outlet />;
}
