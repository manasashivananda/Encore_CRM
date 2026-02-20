import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import OrderQualityCheckingDashboard from "./dashboard";
import OrderQualityCheckingDetail from "./detail";

export default function OrderQualityCheckingCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<OrderQualityCheckingLayout />}>
          <Route index element={<OrderQualityCheckingDashboard />} />
          <Route path=":id" element={<OrderQualityCheckingDetail />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function OrderQualityCheckingLayout() {
  return <Outlet />;
}
