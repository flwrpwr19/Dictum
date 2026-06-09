use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct Snippet {
    pub phrase: String,
    pub expansion: String,
}

/// Replace spoken trigger phrases with their expansions (case-insensitive).
/// Longest phrases are applied first so more specific snippets win.
pub fn apply_snippets(text: &str, snippets: &[Snippet]) -> String {
    if text.is_empty() || snippets.is_empty() {
        return text.to_string();
    }

    let mut ordered: Vec<&Snippet> = snippets
        .iter()
        .filter(|s| !s.phrase.trim().is_empty())
        .collect();
    ordered.sort_by(|a, b| b.phrase.len().cmp(&a.phrase.len()));

    let mut result = text.to_string();
    for snippet in ordered {
        result = replace_insensitive(&result, &snippet.phrase, &snippet.expansion);
    }
    result
}

fn replace_insensitive(haystack: &str, needle: &str, replacement: &str) -> String {
    if needle.is_empty() {
        return haystack.to_string();
    }

    let lower_hay = haystack.to_lowercase();
    let lower_needle = needle.to_lowercase();
    let mut out = String::with_capacity(haystack.len());
    let mut i = 0usize;

    while let Some(rel) = lower_hay[i..].find(&lower_needle) {
        let at = i + rel;
        out.push_str(&haystack[i..at]);
        out.push_str(replacement);
        i = at + needle.len();
    }
    out.push_str(&haystack[i..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_case_insensitive() {
        let snippets = vec![Snippet {
            phrase: "my main proton mail".into(),
            expansion: "lei@proton.me".into(),
        }];
        let out = apply_snippets("Send it to My Main Proton Mail please", &snippets);
        assert_eq!(out, "Send it to lei@proton.me please");
    }
}
