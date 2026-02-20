import { configureStore } from "@reduxjs/toolkit";
import orderReducer from "./masterOrderSlice";
import quotationReducer from "./quotationSlice";
import designReportReducer from "./designReportSlice";
import qcReportReducer from "./qcReportSlice";
import orderReportReducer from "./orderReportSlice";
import doubtReducer from "./doubtSlice";
import supplierReducer from "./supplierSlice";
import deliveryDashboardReducer from "./deliveryDashboardSlice";

const store = configureStore({
  reducer: {
    orders: orderReducer,
    quotation: quotationReducer,
    designReport: designReportReducer,
    qcReport: qcReportReducer,
    orderReport: orderReportReducer,
    doubt: doubtReducer,
    supplier: supplierReducer,
    deliveryDashboard: deliveryDashboardReducer
  },
});

export default store;
