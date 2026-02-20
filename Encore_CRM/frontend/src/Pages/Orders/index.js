import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import OrderManage from "./manage";
import OrderDetail from "./detail";
import ErrorOrderManage from "./errorOrder";

export default function OrdersCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<OrderLayout />}>
          <Route index element={<OrderManage />} />
          <Route path=":id" element={<OrderDetail />} />
          <Route path="/error-orders" element={<ErrorOrderManage />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function OrderLayout() {
  return <Outlet />;
}
