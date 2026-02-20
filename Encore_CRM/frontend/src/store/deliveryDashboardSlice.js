import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  filters: {
    search_text: "",
  },
  sorting: {
    sortField: "order_customer_name",
    sortDirection: "-1",
  },
};

const deliveryDashboardSlice = createSlice({
  name: "orders",
  initialState,
  reducers: {
    setFilters(state, action) {
      state.filters = { ...state.filters, ...action.payload };
    },
    setSorting(state, action) {
      state.sorting = action.payload;
    },
    resetFiltersAndSorting(state) {
      state.filters = initialState.filters;
      state.sorting = initialState.sorting;
    },
  },
});

export const { setFilters, setSorting, resetFiltersAndSorting } = deliveryDashboardSlice.actions;
export default deliveryDashboardSlice.reducer;
