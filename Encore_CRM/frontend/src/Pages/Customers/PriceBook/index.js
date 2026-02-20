import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import CustomerPriceBookManage from "./manage";

export default function CustomerPriceBookCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<CustomerPriceBookLayout />}>
          <Route index element={<CustomerPriceBookManage />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function CustomerPriceBookLayout() {
  return <Outlet />;
}
