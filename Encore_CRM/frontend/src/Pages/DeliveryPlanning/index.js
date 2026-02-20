import { Routes, Route, Outlet } from "react-router-dom";
import DeliveryPlanning from "./manage";
import ExternalOrders from "./ExternalOrders/manage";

export default function DeliveryPlanningCore() {
    return (
        <>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<DeliveryPlanning />} />
                    <Route path="/ext-orders" element={<ExternalOrders />} />
                </Route>
            </Routes>
            <Outlet />
        </>
    );
}

function Layout() {
    return (
        <>
            <Outlet />
        </>
    );
}
