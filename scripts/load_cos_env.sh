#!/usr/bin/env bash

# Load only known COS routing settings from the project .env. This deliberately
# avoids sourcing the complete file, which also contains secrets and values that
# are not necessarily valid shell syntax.
load_cos_env_file() {
  local env_file="$1"
  local line key value

  [[ -f "$env_file" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" == *"="* ]] || continue

    key="${line%%=*}"
    key="${key#export }"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    case "$key" in
      COS_SH_BUCKET|COS_SH_REGION|COS_SH_DOMAIN|\
      COS_EU_BUCKET|COS_EU_REGION|COS_EU_DOMAIN|\
      COS_SHANGHAI_BUCKET|COS_SHANGHAI_REGION|COS_SHANGHAI_DOMAIN|\
      COS_FRANKFURT_BUCKET|COS_FRANKFURT_REGION|COS_FRANKFURT_DOMAIN)
        ;;
      *)
        continue
        ;;
    esac

    # Explicitly exported values take precedence over the .env file.
    [[ -n "${!key-}" ]] && continue

    value="${line#*=}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ ${#value} -ge 2 ]]; then
      if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]] || \
         [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi

    printf -v "$key" '%s' "$value"
    export "$key"
  done < "$env_file"
}
