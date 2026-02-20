import { createSlice } from "@reduxjs/toolkit";

const supplierSlice = createSlice({
  name: "supplier",
  initialState: {
    count: 0,
  },
  reducers: {
    setSupplierCount: (state, action) => {
      state.count = action.payload;
    },
  },
});

export const { setSupplierCount } = supplierSlice.actions;
export default supplierSlice.reducer;
