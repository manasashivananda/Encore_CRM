import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import RackingManage from "./manage";

export default function RackingCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<RackingLayout />}>
          <Route index element={<RackingManage />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function RackingLayout() {
  return <Outlet />;
}
