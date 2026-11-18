#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
resource_dir="${repo_root}/apps/lexicon/data/external/morphology"
archive="${resource_dir}/german-pos-dict-a0d7adc94c13c0532e087b839159452663f7ea93.tar.gz"
output="${resource_dir}/forms.tsv.gz"
version="2.1.6"

if [[ ! -f "${archive}" ]]; then
  echo "Missing pinned dictionary archive: ${archive}" >&2
  exit 1
fi

work_dir="$(mktemp -d "${resource_dir}/.export.XXXXXX")"
trap 'rm -rf "${work_dir}"' EXIT
base="https://repo.maven.apache.org/maven2/org/carrot2"
curl -fsSL "${base}/morfologik-stemming/${version}/morfologik-stemming-${version}.jar" -o "${work_dir}/morfologik-stemming.jar"
curl -fsSL "${base}/morfologik-fsa/${version}/morfologik-fsa-${version}.jar" -o "${work_dir}/morfologik-fsa.jar"

dict_path="german-pos-dict-a0d7adc94c13c0532e087b839159452663f7ea93/src/main/resources/org/languagetool/resource/de"
tar -xOzf "${archive}" "${dict_path}/german.dict" > "${work_dir}/german.dict"
tar -xOzf "${archive}" "${dict_path}/german.info" > "${work_dir}/german.info"

classpath="${work_dir}/morfologik-stemming.jar:${work_dir}/morfologik-fsa.jar"
mkdir "${work_dir}/classes"
javac -encoding UTF-8 -cp "${classpath}" -d "${work_dir}/classes" "${repo_root}/scripts/ExportGermanMorphology.java"
java -cp "${work_dir}/classes:${classpath}" ExportGermanMorphology "${work_dir}/german.dict" | gzip -c > "${work_dir}/forms.tsv.gz"
gzip -t "${work_dir}/forms.tsv.gz"
gzip -cd "${work_dir}/forms.tsv.gz" | awk -F '\t' 'NF != 3 || $1 == "" || $2 == "" { exit 1 } END { if (NR == 0) exit 1 }'
mv -f "${work_dir}/forms.tsv.gz" "${output}"
