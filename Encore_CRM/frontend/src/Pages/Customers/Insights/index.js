import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import CustomerInsightsManage from './manage';
import CustomerInsightsDetail from './detail';

export default function CustomerInsightsCore() {
    return (
        <>
            <Routes>
                <Route path="/" element={<CustomerInsightsLayout />}>
                    <Route index element={<CustomerInsightsManage />} />
                    <Route path="detail" element={<CustomerInsightsDetail />} />
                </Route>
            </Routes>
            <Outlet />
        </>
    );
}




function CustomerInsightsLayout() {
    return (
        <>
            <Outlet />
        </>
    );
}
