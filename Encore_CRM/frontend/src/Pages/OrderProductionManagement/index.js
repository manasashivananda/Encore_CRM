import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import OrderProductionDashboard from "./dashboard";
import OrderProductionDetail from "./detail";

export default function OrderProductionCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<OrderProductionLayout />}>
          <Route index element={<OrderProductionDashboard />} />
          <Route path=":id" element={<OrderProductionDetail />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function OrderProductionLayout() {
  return <Outlet />;
}
