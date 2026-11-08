import org.mpxj.ProjectFile;
import org.mpxj.mspdi.MSPDIWriter;
import org.mpxj.reader.UniversalProjectReader;

/** Converts a project file MPXJ can read (.mpp and others) to MS Project XML (MSPDI). */
public class MppToXml {
  public static void main(String[] args) throws Exception {
    ProjectFile project = new UniversalProjectReader().read(args[0]);
    if (project == null) {
      System.err.println("Formato no reconocido");
      System.exit(2);
    }
    new MSPDIWriter().write(project, args[1]);
  }
}
