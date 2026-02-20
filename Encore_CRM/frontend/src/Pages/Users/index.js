import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import UsersManage from "./manage";
import UserDetail from "./detail";
import RolesCore from "./Roles";
import ConfigsCore from "./Configs";

export default function UsersCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<UsersLayout />}>
          <Route index element={<UsersManage />} />
          <Route path="/:id" element={<UserDetail />} />
          <Route path="/roles" element={<RolesCore />} />
          <Route path="/configs" element={<ConfigsCore />} />

        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function UsersLayout() {
  return <Outlet />;
}
