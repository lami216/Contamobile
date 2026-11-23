import javax.tools.ToolProvider;
import java.nio.file.*;
import java.net.*;
import java.util.*;

/** Exercise the actual native allowlist without Android or a service connection. */
public class RecoveryFailureCheck {
 public static void main(String[] args) throws Exception {
  Path root=Path.of("").toAbsolutePath(),out=Files.createTempDirectory("contatools-recovery-diagnostics-");
  try{
   var compiler=ToolProvider.getSystemJavaCompiler();if(compiler==null)throw new IllegalStateException("JDK compiler required");
   int status=compiler.run(null,null,null,"-d",out.toString(),root.resolve("approved-android/app/src/main/java/mr/alkarna/mobile/approved/RecoveryFailure.java").toString(),root.resolve("scripts/RecoveryFailureProbe.java").toString());
   if(status!=0)throw new IllegalStateException("Native diagnostics compilation failed");
   try(var loader=new URLClassLoader(new URL[]{out.toUri().toURL()})){Class.forName("mr.alkarna.mobile.approved.RecoveryFailureProbe",true,loader).getMethod("main",String[].class).invoke(null,(Object)new String[0]);}
  }finally{try(var files=Files.walk(out)){for(Path file:files.sorted(Comparator.reverseOrder()).toList())Files.delete(file);}}
 }
}
