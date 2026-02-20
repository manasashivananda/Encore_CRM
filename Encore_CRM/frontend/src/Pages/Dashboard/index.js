import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import DashboardMain from "./dashboard";
import ProductionStatusDashboard from "./ProductionStatus";
import OperationDashboard from "./OperationDashboard";

export default function DashboardCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<DashboardMain />} />
          <Route path="/prod-status" element={<ProductionStatusDashboard />} />
          <Route path="/operation" element={<OperationDashboard />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function DashboardLayout() {
  return <Outlet />;
}
