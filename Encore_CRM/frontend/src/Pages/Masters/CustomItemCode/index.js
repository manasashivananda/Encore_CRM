import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import CustomItemCodeManage from "./manage";

export default function CustomItemCodeCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<CustomItemCodeLayout />}>
          <Route index element={<CustomItemCodeManage />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function CustomItemCodeLayout() {
  return <Outlet />;
}
