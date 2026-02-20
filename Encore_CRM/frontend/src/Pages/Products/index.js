import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import ProductManage from "./manage";
import ProductDetail from "./detail";
import GirthFoldsCore from "./GrithFold";

export default function ProductCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<ProductLayout />}>
          <Route index element={<ProductManage />} />
          <Route path=":id" element={<ProductDetail />} />
          <Route path="/manage-girth-folds" element={<GirthFoldsCore />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function ProductLayout() {
  return <Outlet />;
}
