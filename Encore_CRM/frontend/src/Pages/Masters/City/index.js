import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import CityManage from "./manage";

export default function CityCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<CityLayout />}>
          <Route index element={<CityManage />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function CityLayout() {
  return <Outlet />;
}
