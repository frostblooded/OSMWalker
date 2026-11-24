//! The game's code, kept in a library so integration tests in `tests/` can use it.

/// What the app prints on start.
pub fn greeting() -> &'static str {
    "Hello, world!"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greets_the_world() {
        assert_eq!(greeting(), "Hello, world!");
    }
}
