import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import DepartmentManage from "./manage";
import DepartmentDetail from "./detail";

export default function DepartmentCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<DepartmentLayout />}>
          <Route index element={<DepartmentManage />} />
          <Route path=":id" element={<DepartmentDetail />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}
function DepartmentLayout() {
  return <Outlet />;
}
