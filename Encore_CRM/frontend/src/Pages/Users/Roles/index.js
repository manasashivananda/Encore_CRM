import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import ManageRoles from "./manage";

export default function RolesCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<RolesLayout />}>
          <Route index element={<ManageRoles />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function RolesLayout() {
  return <Outlet />;
}
