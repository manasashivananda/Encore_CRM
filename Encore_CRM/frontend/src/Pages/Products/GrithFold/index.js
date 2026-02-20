import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import GirthFoldsManage from "./manage";

export default function GirthFoldsCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<GirthFoldsLayout />}>
          <Route index element={<GirthFoldsManage />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function GirthFoldsLayout() {
  return <Outlet />;
}
