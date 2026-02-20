import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import DoubtsManage from "./Doubts/manage";
import SupplierItemManage from "./Supplier-Items/manage";

export default function QueriesCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<QueriesLayout />}>
          <Route index element={<DoubtsManage />} />
          <Route path="doubts" element={<DoubtsManage />} />
          <Route path="supplier-items" element={<SupplierItemManage />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function QueriesLayout() {
  return <Outlet />;
}
