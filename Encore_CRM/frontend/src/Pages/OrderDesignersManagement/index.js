import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import OrderDesignersDashboard from "./dashboard";
import OrderDesignerDetail from "./detail";

export default function OrderDesignersCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<OrderDesignersLayout />}>
          <Route index element={<OrderDesignersDashboard />} />
          <Route path=":id" element={<OrderDesignerDetail />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function OrderDesignersLayout() {
  return <Outlet />;
}
