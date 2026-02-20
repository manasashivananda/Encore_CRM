import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import CustomerManage from "./manage";
import CustomerDetail from "./detail";

export default function CustomerCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<CustomerLayout />}>
          <Route index element={<CustomerManage />} />
          <Route path=":id" element={<CustomerDetail />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function CustomerLayout() {
  return <Outlet />;
}
