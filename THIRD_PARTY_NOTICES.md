# Third-party notices

## MongoDB Community Server (mongod)

Opengantt BIM ships an unmodified `mongod` binary from MongoDB Community Server
as a separate process that stores your projects locally. It is bound to
127.0.0.1 only and is not part of Opengantt BIM's own code (which is MIT).

MongoDB Community Server is licensed under the Server Side Public License,
version 1 (SSPL). Source code and license text: https://github.com/mongodb/mongo
and https://www.mongodb.com/legal/licensing/server-side-public-license

## MPXJ, Apache POI and a Java runtime (.mpp import)

To read binary MS Project (.mpp) files, the installer includes a minimal OpenJDK
runtime (GPLv2 with Classpath Exception, Eclipse Temurin), MPXJ (LGPL-2.1,
https://www.mpxj.org) and Apache POI plus its dependencies (Apache-2.0), unmodified,
run as a separate process that converts the file to MS Project XML.

## That Open Company (BIM viewer)

The 3D viewer is built on `@thatopen/components` and `@thatopen/fragments` (MIT) by
That Open Company, and reads IFC with `web-ifc` (MPL-2.0). The libraries' corner logo is
switched off in the viewer through their own `showLogo` option; the credit is kept here and
in the README.

## Other

DHTMLX Gantt Community (MIT), React (MIT), Electron (MIT), the MongoDB Node.js
driver (Apache-2.0). See each package's license in `node_modules`.
