import { createSlice } from "@reduxjs/toolkit";
import moment from "moment";

const initialState = {
  filters: {
    search_text: "",
    myobStatus: "",
    customerId: "",
    startDate: moment().startOf("day").format("YYYY-MM-DD"),
    endDate: moment().endOf("day").format("YYYY-MM-DD"),
  },
  sorting: {
    sortField: "order_unique_id",
    sortDirection: "-1",
  },
};

const masterOrderSlice = createSlice({
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

export const { setFilters, setSorting, resetFiltersAndSorting } = masterOrderSlice.actions;
export default masterOrderSlice.reducer;
