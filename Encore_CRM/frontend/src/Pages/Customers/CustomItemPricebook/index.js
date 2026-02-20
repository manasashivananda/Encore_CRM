import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import CustomerCustomItemPriceBookManage from "./manage";

export default function CustomerCustomItemPriceBookCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<CustomerCustomItemPriceBookLayout />}>
          <Route index element={<CustomerCustomItemPriceBookManage />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function CustomerCustomItemPriceBookLayout() {
  return <Outlet />;
}
