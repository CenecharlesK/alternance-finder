package fr.alternance.alternance_api;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/offres")
@CrossOrigin(origins = {"http://localhost:5500", "http://127.0.0.1:5500"})
public class OffresController {

    private final JdbcTemplate jdbcTemplate;

    public OffresController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping
    public List<Map<String, Object>> getOffres() {
        // NULLIF : une URL vide est renvoyée comme null (aucun lien fiable).
        // Les offres dont la date d'expiration est passée sont masquées.
        return jdbcTemplate.queryForList("""
            SELECT id, entreprise, poste, lieu, contrat, duree, publie,
                   expiration, domaine, NULLIF(url, '') AS url
            FROM offres
            WHERE expiration IS NULL
               OR expiration = ''
               OR expiration > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            ORDER BY publie DESC
            """);
    }
}