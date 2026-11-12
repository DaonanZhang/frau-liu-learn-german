import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

import morfologik.stemming.Dictionary;
import morfologik.stemming.DictionaryLookup;
import morfologik.stemming.WordData;

public final class ExportGermanMorphology {
  public static void main(String[] args) throws IOException {
    Dictionary dictionary = Dictionary.read(Path.of(args[0]));
    DictionaryLookup lookup = new DictionaryLookup(dictionary);
    BufferedWriter output = new BufferedWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8));
    for (WordData data : lookup) {
      String surface = data.getWord().toString();
      String lemma = data.getStem().toString();
      String tag = data.getTag().toString();
      if (surface.isEmpty() || lemma.isEmpty() || tag.isEmpty()
          || hasLineBreakOrTab(surface) || hasLineBreakOrTab(lemma) || hasLineBreakOrTab(tag)) {
        throw new IOException("Dictionary entry cannot be represented as a three-column TSV row");
      }
      output.write(surface);
      output.write('\t');
      output.write(lemma);
      output.write('\t');
      output.write(tag);
      output.newLine();
    }
    output.flush();
  }

  private static boolean hasLineBreakOrTab(String value) {
    return value.indexOf('\t') >= 0 || value.indexOf('\n') >= 0 || value.indexOf('\r') >= 0;
  }
}
