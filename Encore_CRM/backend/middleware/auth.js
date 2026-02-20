const jwt = require("jsonwebtoken");

const config = process.env;

module.exports.checkRole = function(role, accessType) {return async function(req, res, next) { 
  const token =
    req.body.token || req.query.token || req.headers["x-access-token"];

  if (!token) {
    return res.status(403).send("A token is required for authentication");
  }
  try {
    const decoded = jwt.verify(token, config.TOKEN_KEY);
    req.user = decoded;
  } catch (err) {
    return res.status(401).send("Invalid Token");
  }
  
  //Getting profile access
  if(role == "myProfile" && req.params.id == req.user.emp_ref_id){
	  return next();
  }
  var modulePermissioninfo = await checkPermission(req.user.user_role.rolepermissions, role);
	if(modulePermissioninfo.includes(accessType)){
		return next();
	} else {
		return res.status(400).send("User doesn't have access to this operation.");
		console.log("User doesn't have access to this operation.");
		res.end();
	}
}};

module.exports.checkAnyRole = function(roles, accessType) {
  return async function(req, res, next) {
    const token =
      req.body.token || req.query.token || req.headers["x-access-token"];

    if (!token) {
      return res.status(403).send("A token is required for authentication");
    }

    try {
      const decoded = jwt.verify(token, config.TOKEN_KEY);
      req.user = decoded;
    } catch (err) {
      return res.status(401).send("Invalid Token");
    }

    // Getting profile access
    if (roles.includes("myProfile") && req.params.id == req.user.emp_ref_id) {
      return next();
    }

    var hasAccess = false;
    for (var i = 0; i < roles.length; i++) {
      var modulePermissioninfo = await checkPermission(
        req.user.user_role.rolepermissions,
        roles[i]
      );
      if (modulePermissioninfo.includes(accessType)) {
        hasAccess = true;
        break;
      }
    }

    if (hasAccess) {
      return next();
    } else {
      return res
        .status(400)
        .send("User doesn't have access to this operation.");
      console.log("User doesn't have access to this operation.");
      res.end();
    }
  };
};


const verifyToken = (req, res, next) => {
  const token =
    req.body.token || req.query.token || req.headers["x-access-token"];

  if (!token) {
    return res.status(403).send("A token is required for authentication");
  }
  try {
    const decoded = jwt.verify(token, config.TOKEN_KEY);
    req.user = decoded;
  } catch (err) {
    return res.status(401).send("Invalid Token");
  }
  return next();
};

module.exports.verifyToken = verifyToken;

async function checkPermission(RolePermission, ModuleInfo){
	//console.log("length of permissions:", Object.keys(RolePermission).length);
	//console.log(ModuleInfo);
	var permissionArr = [];
	if(Object.keys(RolePermission).length > 0){
		for (const key of Object.keys(RolePermission)) {
		  if(key == ModuleInfo){
			if(RolePermission[key].add == "1"){ permissionArr.push("add");}
			if(RolePermission[key].edit == "1"){ permissionArr.push("edit");};
			if(RolePermission[key].view == "1"){ permissionArr.push("view");};
		  }
		}
	}
	return permissionArr;
}