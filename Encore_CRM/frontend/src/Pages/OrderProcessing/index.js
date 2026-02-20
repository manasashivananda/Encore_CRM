import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import OrderProcessingManage from './manage';


export default function OrderProcessingCore() {
    return (
        <>
            <Routes>
                <Route path="/" element={<OrderProcessingLayout />}>
                    <Route index element={<OrderProcessingManage />} />
                    {/*  <Route path="contact" element={<CustomerContactCore />} /> */}
                </Route>
            </Routes>
            <Outlet />
        </>
    );
}




function OrderProcessingLayout() {
    return (
        <>
            <Outlet />
        </>
    );
}
