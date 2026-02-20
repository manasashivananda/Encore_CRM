import * as React from "react";
import { Link } from "react-router-dom";
import { HeadingTwo, MyDiv } from "./Components";

function NoMatch() {
  return (
    <MyDiv className="text-center row">
      <HeadingTwo>Nothing to see here!</HeadingTwo>
      <p>
        <Link to="/">Go to the home page</Link>
      </p>
    </MyDiv>
  );
}

export default NoMatch;
