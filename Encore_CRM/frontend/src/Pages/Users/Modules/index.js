import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import ModulesManage from "./manage";

export default function ModulesCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<ModulesLayout />}>
          <Route index element={<ModulesManage />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function ModulesLayout() {
  return <Outlet />;
}
