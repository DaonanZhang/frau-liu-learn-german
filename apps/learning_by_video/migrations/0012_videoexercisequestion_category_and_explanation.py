from django.db import migrations, models
import django.db.models


class Migration(migrations.Migration):

    dependencies = [
        ("learning_by_video", "0011_learningvideousersubtitlefavorite"),
    ]

    operations = [
        migrations.AddField(
            model_name="videoexercisequestion",
            name="category",
            field=models.CharField(
                choices=[("listening", "Listening"), ("grammar", "Grammar")],
                db_index=True,
                default="listening",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="videoexercisequestion",
            name="explanation",
            field=models.TextField(
                blank=True,
                default="",
                help_text="Question-level explanation, mainly used by grammar exercises.",
            ),
        ),
        migrations.AddIndex(
            model_name="videoexercisequestion",
            index=models.Index(fields=["video", "category", "order"], name="vxq_v_c_o"),
        ),
        migrations.RemoveConstraint(
            model_name="videoexercisequestion",
            name="vxq_v_ext_uq",
        ),
        migrations.AddConstraint(
            model_name="videoexercisequestion",
            constraint=models.UniqueConstraint(
                condition=~django.db.models.Q(external_id=""),
                fields=("video", "category", "external_id"),
                name="vxq_v_cat_ext_uq",
            ),
        ),
    ]
