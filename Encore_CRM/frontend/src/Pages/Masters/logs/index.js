import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import LogsManage from "./manage";

export default function LogsCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<LogsLayout />}>
          <Route index element={<LogsManage />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function LogsLayout() {
  return <Outlet />;
}
