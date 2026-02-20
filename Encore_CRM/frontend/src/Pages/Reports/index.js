import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import DesignerReport from "./designerReport";
import QCReport from "./qcReport";
import ProductionReport from "./productionReport";
import LoadingReport from "./loadingReport";
import CustomerReport from "./customerReport";
import OrderReport from "./orderreport";
import RackManagement from "./rackManagement";
import ProductionEmployeeMaster from "../OrderProductionManagement/employeeMaster";
import DeliveryReport from "./deliveryReport";
import DeliveryDocket from "./deliveryDocket";
import SWIMachineReport from "./SWIMachineReport";

export default function ReportsCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<ReportsLayout />}>
          <Route path="/designer-reports" element={<DesignerReport />} />
          <Route path="/qc-reports" element={<QCReport />} />
          <Route path="/production-reports" element={<ProductionReport />} />
          <Route path="/loading-reports" element={<LoadingReport />} />
          <Route path="/delivery-reports" element={<DeliveryReport />} />
          <Route path="/customer-reports" element={<CustomerReport />} />
          <Route path="/order-reports" element={<OrderReport />} />
          <Route path="/rack-management" element={<RackManagement />} />
          <Route path="/production-emp-work-info" element={<ProductionEmployeeMaster />} />
          <Route path="/delivery-docket" element={<DeliveryDocket />} />
          <Route path="/swi-machine" element={<SWIMachineReport />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function ReportsLayout() {
  return <Outlet />;
}
