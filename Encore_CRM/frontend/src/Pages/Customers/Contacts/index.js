import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import CustomerContactManage from "./manage";
import CustomerContactDetail from "./detail";

export default function CustomerContactCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<CustomerContactLayout />}>
          <Route index element={<CustomerContactManage />} />
          <Route path="detail" element={<CustomerContactDetail />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function CustomerContactLayout() {
  return <Outlet />;
}
