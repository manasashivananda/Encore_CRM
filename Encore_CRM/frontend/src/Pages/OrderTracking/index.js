import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import OrderTrackingManage from "./manage";

export default function OrderTrackingCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<OrderTrackingLayout />}>
          <Route index element={<OrderTrackingManage />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function OrderTrackingLayout() {
  return <Outlet />;
}
