import * as React from "react";
import { HeadingTwo, SpanTag } from "./Components";

function NoDataFound({ text = "No Data Found" }) {
  return (
    <SpanTag className="text-center justify-content-center d-flex">
      <HeadingTwo className="noDataFound">{text}</HeadingTwo>
    </SpanTag>
  );
}

export default NoDataFound;
