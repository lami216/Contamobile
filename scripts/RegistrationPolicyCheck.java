import javax.tools.ToolProvider;
import java.nio.file.*;
import java.net.*;
import java.util.*;

/** Runs the actual dependency-free native policy on a JDK without building an APK. */
public class RegistrationPolicyCheck {
 public static void main(String[] args) throws Exception {
  Path root=Path.of("").toAbsolutePath(),out=Files.createTempDirectory("contatools-policy-");
  try{
   var compiler=ToolProvider.getSystemJavaCompiler();if(compiler==null)throw new IllegalStateException("JDK compiler required");
   int status=compiler.run(null,null,null,"-d",out.toString(),root.resolve("approved-android/app/src/main/java/mr/alkarna/mobile/approved/RegistrationPolicy.java").toString(),root.resolve("scripts/RegistrationPolicyProbe.java").toString());
   if(status!=0)throw new IllegalStateException("Native policy compilation failed");
   try(var loader=new URLClassLoader(new URL[]{out.toUri().toURL()})){Class.forName("mr.alkarna.mobile.approved.RegistrationPolicyProbe",true,loader).getMethod("main",String[].class).invoke(null,(Object)new String[0]);}
  }finally{try(var files=Files.walk(out)){for(Path file:files.sorted(Comparator.reverseOrder()).toList())Files.delete(file);}}
 }
}
